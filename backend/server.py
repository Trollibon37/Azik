from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import socketio
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
import asyncio
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30 * 24 * 60  # 30 days

security = HTTPBearer()

# Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=True
)

# FastAPI app
app = FastAPI()

# Socket.IO app
socket_app = socketio.ASGIApp(sio, app)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Models
class UserRegister(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    username: str
    email: str
    total_score: int = 0
    created_at: str

class GameRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    mode: str
    score: int
    duration: int
    date: str

class Achievement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    achievement_name: str
    unlocked_at: str

class LeaderboardEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    username: str
    total_score: int
    best_score: int
    games_played: int

# Helper functions
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        return user_id
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

# API Routes
@app.get("/api/")
async def root():
    return {"message": "Yiğit'e Vurma Oyunu API"}

@app.post("/api/auth/register")
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email zaten kayıtlı")
    
    existing_username = await db.users.find_one({"username": user_data.username}, {"_id": 0})
    if existing_username:
        raise HTTPException(status_code=400, detail="Kullanıcı adı zaten alınmış")
    
    # Create user
    user_id = str(uuid.uuid4())
    hashed_pw = hash_password(user_data.password)
    user_doc = {
        "id": user_id,
        "username": user_data.username,
        "email": user_data.email,
        "password": hashed_pw,
        "total_score": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    
    # Create token
    access_token = create_access_token({"sub": user_id})
    
    return {
        "token": access_token,
        "user": {
            "id": user_id,
            "username": user_data.username,
            "email": user_data.email,
            "total_score": 0
        }
    }

@app.post("/api/auth/login")
async def login(login_data: UserLogin):
    user = await db.users.find_one({"email": login_data.email}, {"_id": 0})
    if not user or not verify_password(login_data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Email veya şifre hatalı")
    
    access_token = create_access_token({"sub": user["id"]})
    
    return {
        "token": access_token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "total_score": user.get("total_score", 0)
        }
    }

@app.get("/api/user/me")
async def get_me(user_id: str = Depends(get_current_user)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    return user

@app.post("/api/game/save")
async def save_game(game_data: dict, user_id: str = Depends(get_current_user)):
    game_id = str(uuid.uuid4())
    game_doc = {
        "id": game_id,
        "user_id": user_id,
        "mode": game_data["mode"],
        "score": game_data["score"],
        "duration": game_data["duration"],
        "date": datetime.now(timezone.utc).isoformat()
    }
    await db.games.insert_one(game_doc)
    
    # Update user total score
    await db.users.update_one(
        {"id": user_id},
        {"$inc": {"total_score": game_data["score"]}}
    )
    
    # Check for achievements
    await check_achievements(user_id, game_data["score"])
    
    return {"message": "Oyun kaydedildi", "game_id": game_id}

@app.get("/api/game/records")
async def get_records(user_id: str = Depends(get_current_user)):
    records = await db.games.find(
        {"user_id": user_id},
        {"_id": 0}
    ).sort("score", -1).limit(10).to_list(10)
    return records

@app.get("/api/leaderboard")
async def get_leaderboard():
    pipeline = [
        {
            "$lookup": {
                "from": "games",
                "localField": "id",
                "foreignField": "user_id",
                "as": "user_games"
            }
        },
        {
            "$project": {
                "_id": 0,
                "username": 1,
                "total_score": 1,
                "best_score": {"$max": "$user_games.score"},
                "games_played": {"$size": "$user_games"}
            }
        },
        {"$sort": {"total_score": -1}},
        {"$limit": 10}
    ]
    
    leaderboard = await db.users.aggregate(pipeline).to_list(10)
    return leaderboard

@app.get("/api/achievements")
async def get_achievements(user_id: str = Depends(get_current_user)):
    achievements = await db.achievements.find(
        {"user_id": user_id},
        {"_id": 0}
    ).to_list(100)
    return achievements

async def check_achievements(user_id: str, score: int):
    achievements_to_check = [
        {"name": "İlk Vuruş", "condition": score >= 1},
        {"name": "10 Vuruş", "condition": score >= 10},
        {"name": "50 Vuruş", "condition": score >= 50},
        {"name": "100 Vuruş", "condition": score >= 100},
        {"name": "Kombo Ustası", "condition": score >= 200},
    ]
    
    for ach in achievements_to_check:
        if ach["condition"]:
            existing = await db.achievements.find_one(
                {"user_id": user_id, "achievement_name": ach["name"]},
                {"_id": 0}
            )
            if not existing:
                ach_doc = {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "achievement_name": ach["name"],
                    "unlocked_at": datetime.now(timezone.utc).isoformat()
                }
                await db.achievements.insert_one(ach_doc)

# Socket.IO events
game_rooms: Dict[str, Dict] = {}

@sio.event
async def connect(sid, environ):
    logger.info(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")
    # Remove player from any room
    for room_code, room in list(game_rooms.items()):
        if sid in [room.get('player1'), room.get('player2')]:
            if room.get('player1') == sid:
                if room.get('player2'):
                    await sio.emit('opponent_left', room=room.get('player2'))
            elif room.get('player2') == sid:
                if room.get('player1'):
                    await sio.emit('opponent_left', room=room.get('player1'))
            del game_rooms[room_code]
            break

@sio.event
async def create_room(sid, data):
    room_code = str(uuid.uuid4())[:6].upper()
    game_rooms[room_code] = {
        'player1': sid,
        'player2': None,
        'player1_score': 0,
        'player2_score': 0,
        'player1_username': data.get('username', 'Oyuncu 1'),
        'player2_username': None,
        'game_started': False
    }
    await sio.emit('room_created', {'room_code': room_code}, room=sid)
    logger.info(f"Room created: {room_code} by {sid}")

@sio.event
async def join_room(sid, data):
    room_code = data['room_code'].upper()
    if room_code not in game_rooms:
        await sio.emit('error', {'message': 'Oda bulunamadı'}, room=sid)
        return
    
    room = game_rooms[room_code]
    if room['player2'] is not None:
        await sio.emit('error', {'message': 'Oda dolu'}, room=sid)
        return
    
    room['player2'] = sid
    room['player2_username'] = data.get('username', 'Oyuncu 2')
    
    # Notify both players
    await sio.emit('player_joined', {
        'player1_username': room['player1_username'],
        'player2_username': room['player2_username']
    }, room=room['player1'])
    
    await sio.emit('player_joined', {
        'player1_username': room['player1_username'],
        'player2_username': room['player2_username']
    }, room=sid)
    
    logger.info(f"Player {sid} joined room {room_code}")

@sio.event
async def start_game(sid, data):
    room_code = data['room_code'].upper()
    if room_code not in game_rooms:
        return
    
    room = game_rooms[room_code]
    if room['player1'] != sid and room['player2'] != sid:
        return
    
    if not room['game_started']:
        room['game_started'] = True
        room['player1_score'] = 0
        room['player2_score'] = 0
        
        # Start game for both players
        await sio.emit('game_start', {}, room=room['player1'])
        await sio.emit('game_start', {}, room=room['player2'])
        logger.info(f"Game started in room {room_code}")

@sio.event
async def player_hit(sid, data):
    room_code = data['room_code'].upper()
    if room_code not in game_rooms:
        return
    
    room = game_rooms[room_code]
    if sid == room['player1']:
        room['player1_score'] += 1
        # Send score to opponent
        if room['player2']:
            await sio.emit('opponent_score', {'score': room['player1_score']}, room=room['player2'])
    elif sid == room['player2']:
        room['player2_score'] += 1
        # Send score to opponent
        if room['player1']:
            await sio.emit('opponent_score', {'score': room['player2_score']}, room=room['player1'])

@sio.event
async def game_end(sid, data):
    room_code = data['room_code'].upper()
    if room_code not in game_rooms:
        return
    
    room = game_rooms[room_code]
    
    # Notify both players of final scores
    final_data = {
        'player1_score': room['player1_score'],
        'player2_score': room['player2_score'],
        'player1_username': room['player1_username'],
        'player2_username': room['player2_username']
    }
    
    if room['player1']:
        await sio.emit('game_ended', final_data, room=room['player1'])
    if room['player2']:
        await sio.emit('game_ended', final_data, room=room['player2'])
    
    logger.info(f"Game ended in room {room_code}")
    # Don't delete room immediately, let players see results

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
