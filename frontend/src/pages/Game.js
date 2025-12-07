import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import io from "socket.io-client";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COMBO_WINDOW = 200;
const COMBO_THRESHOLD = 5;
const AUTO_CLICK_SPEED = 20;

export default function Game({ user, logout }) {
  const [screen, setScreen] = useState('start');
  const [mode, setMode] = useState('');
  const [duration, setDuration] = useState(15);
  const [score, setScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [combo, setCombo] = useState(0);
  const [isGameActive, setIsGameActive] = useState(false);
  const [records, setRecords] = useState([]);
  const [showRecords, setShowRecords] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [opponentUsername, setOpponentUsername] = useState('');
  const [autoClickerActive, setAutoClickerActive] = useState(false);
  
  const lastClickTime = useRef(0);
  const gameInterval = useRef(null);
  const autoClickerInterval = useRef(null);
  const socketRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadRecords();
    
    const handleKeyDown = (e) => {
      if (e.key.toLowerCase() === 'j' && isGameActive) {
        setAutoClickerActive(prev => !prev);
      }
      if (e.key === 'ş' || e.key === 'Ş') {
        setShowRecords(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGameActive]);

  useEffect(() => {
    if (autoClickerActive && isGameActive) {
      autoClickerInterval.current = setInterval(() => {
        hitCharacter();
      }, AUTO_CLICK_SPEED);
    } else {
      if (autoClickerInterval.current) {
        clearInterval(autoClickerInterval.current);
      }
    }
    return () => {
      if (autoClickerInterval.current) {
        clearInterval(autoClickerInterval.current);
      }
    };
  }, [autoClickerActive, isGameActive]);

  const loadRecords = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/game/records`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRecords(response.data);
    } catch (error) {
      console.error('Kayıtlar yüklenemedi:', error);
    }
  };

  const selectMode = (dur, modeName) => {
    setDuration(dur);
    setMode(`Tek Kişilik - ${modeName}`);
    startGame('single');
  };

  const startGame = (gameMode) => {
    setScore(0);
    setOpponentScore(0);
    setCombo(0);
    setTimeLeft(duration);
    setIsGameActive(true);
    setScreen('game');
    
    if (gameMode === 'online') {
      setMode('Online Mod');
    }
    
    gameInterval.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          endGame();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const hitCharacter = () => {
    if (!isGameActive) return;
    
    setScore(prev => prev + 1);
    
    const now = Date.now();
    if (now - lastClickTime.current < COMBO_WINDOW) {
      setCombo(prev => prev + 1);
    } else {
      setCombo(1);
    }
    lastClickTime.current = now;
    
    if (mode === 'Online Mod' && socketRef.current) {
      socketRef.current.emit('player_hit', { room_code: roomCode });
    }
  };

  const endGame = async () => {
    setIsGameActive(false);
    setCombo(0);
    setAutoClickerActive(false);
    
    if (gameInterval.current) {
      clearInterval(gameInterval.current);
    }
    
    if (mode !== 'Online Mod') {
      try {
        const token = localStorage.getItem('token');
        await axios.post(
          `${API}/game/save`,
          {
            mode: mode,
            score: score,
            duration: duration
          },
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        await loadRecords();
      } catch (error) {
        console.error('Oyun kaydedilemedi:', error);
      }
    } else {
      if (socketRef.current) {
        socketRef.current.emit('game_end', { room_code: roomCode });
      }
    }
    
    setScreen('end');
  };

  const createRoom = () => {
    const socket = io(BACKEND_URL);
    socketRef.current = socket;
    
    socket.on('connect', () => {
      socket.emit('create_room', { username: user.username });
    });
    
    socket.on('room_created', (data) => {
      setRoomCode(data.room_code);
      setScreen('wait');
      toast.success(`Oda oluşturuldu: ${data.room_code}`);
      
      navigator.clipboard.writeText(data.room_code).then(() => {
        toast.success('Oda kodu kopyalandı!');
      }).catch(() => {
        toast.info('Oda kodunu manuel olarak kopyalayın');
      });
    });
    
    socket.on('player_joined', (data) => {
      setOpponentUsername(data.player2_username);
      toast.success('Oyuncu katıldı! Oyun başlıyor...');
      setTimeout(() => {
        socket.emit('start_game', { room_code: roomCode });
      }, 2000);
    });
    
    socket.on('game_start', () => {
      setDuration(10);
      startGame('online');
    });
    
    socket.on('opponent_score', (data) => {
      setOpponentScore(data.score);
    });
    
    socket.on('opponent_left', () => {
      toast.error('Rakip oyundan ayrıldı');
      endGame();
    });
  };

  const joinRoom = () => {
    if (!inputRoomCode || inputRoomCode.length < 4) {
      toast.error('Geçerli bir oda kodu girin');
      return;
    }
    
    const socket = io(BACKEND_URL);
    socketRef.current = socket;
    
    socket.on('connect', () => {
      socket.emit('join_room', { 
        room_code: inputRoomCode.toUpperCase(), 
        username: user.username 
      });
    });
    
    socket.on('player_joined', (data) => {
      setRoomCode(inputRoomCode.toUpperCase());
      setOpponentUsername(data.player1_username);
      setScreen('wait');
      toast.success('Odaya katıldınız!');
    });
    
    socket.on('game_start', () => {
      setDuration(10);
      startGame('online');
    });
    
    socket.on('opponent_score', (data) => {
      setOpponentScore(data.score);
    });
    
    socket.on('error', (data) => {
      toast.error(data.message);
    });
    
    socket.on('opponent_left', () => {
      toast.error('Rakip oyundan ayrıldı');
      endGame();
    });
  };

  const cancelWait = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    setScreen('online');
    setRoomCode('');
  };

  const getShakeClass = () => {
    if (combo >= 8) return 'shake-heavy';
    if (combo >= 5) return 'shake-medium';
    if (combo >= 3) return 'shake-light';
    return '';
  };

  return (
    <div className={`game-container ${getShakeClass()}`}>
      {screen === 'start' && (
        <div className="screen" data-testid="start-screen">
          <h1 className="game-title">Yiğit'e Vurma Oyunu</h1>
          <p className="welcome-text">Hoş geldin, {user.username}!</p>
          <p className="subtitle">Hazır mısın? (Kayıtlar için 'Ş' tuşuna bas)</p>
          
          <div className="button-group">
            <button className="btn btn-main" onClick={() => setScreen('mode')} data-testid="single-player-button">
              Tek Kişilik Oyna
            </button>
            <button className="btn btn-online" onClick={() => setScreen('online')} data-testid="online-mode-button">
              Online Mod
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/leaderboard')} data-testid="leaderboard-button">
              Liderlik Tablosu
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('/achievements')} data-testid="achievements-button">
              Başarımlar
            </button>
            <button className="btn btn-logout" onClick={logout} data-testid="logout-button">
              Çıkış Yap
            </button>
          </div>
        </div>
      )}

      {screen === 'mode' && (
        <div className="screen" data-testid="mode-screen">
          <h1>Mod Seçin</h1>
          <p>Süreler moda göre otomatik ayarlanacaktır</p>
          
          <div className="button-group">
            <button className="btn btn-easy" onClick={() => selectMode(15, 'Kolay')} data-testid="easy-mode-button">
              Kolay Mod (15s)
            </button>
            <button className="btn btn-medium" onClick={() => selectMode(10, 'Orta')} data-testid="medium-mode-button">
              Orta Mod (10s)
            </button>
            <button className="btn btn-hard" onClick={() => selectMode(7, 'Zor')} data-testid="hard-mode-button">
              Zor Mod (7s)
            </button>
            <button className="btn btn-back" onClick={() => setScreen('start')} data-testid="back-button">
              Geri Dön
            </button>
          </div>
        </div>
      )}

      {screen === 'online' && (
        <div className="screen" data-testid="online-screen">
          <h1>Online Mod</h1>
          <p className="online-subtitle">Gerçek oyuncularla online oyna!</p>
          
          <div className="online-form">
            <input
              type="text"
              placeholder="Oda Kodunu Girin..."
              value={inputRoomCode}
              onChange={(e) => setInputRoomCode(e.target.value)}
              className="room-input"
              data-testid="room-code-input"
            />
            <button className="btn btn-online" onClick={joinRoom} data-testid="join-room-button">
              Odaya Katıl
            </button>
            <button className="btn btn-online" onClick={createRoom} data-testid="create-room-button">
              Oda Oluştur
            </button>
            <button className="btn btn-back" onClick={() => setScreen('start')} data-testid="back-to-start-button">
              Geri Dön
            </button>
          </div>
        </div>
      )}

      {screen === 'wait' && (
        <div className="screen" data-testid="wait-screen">
          <h1>Oyuncu Bekleniyor...</h1>
          <div className="room-code-display" data-testid="room-code-display">
            Oda Kodu: <strong>{roomCode}</strong>
          </div>
          <p className="wait-message">Diğer oyuncunun bu kodu girmesini bekleyin</p>
          <button className="btn btn-cancel" onClick={cancelWait} data-testid="cancel-wait-button">
            İptal Et / Geri Dön
          </button>
        </div>
      )}

      {screen === 'game' && (
        <div className="screen game-screen" data-testid="game-screen">
          {mode === 'Online Mod' ? (
            <div className="score-container-multi">
              <div className="timer-display" data-testid="timer-display">
                Süre: {timeLeft}s
              </div>
              <div className="scores-row">
                <div className="score-box player" data-testid="player-score">
                  <h3>SİZİN SKORUNUZ</h3>
                  <div className="score-value">{score}</div>
                  <p>{user.username}</p>
                </div>
                <div className="score-box opponent" data-testid="opponent-score">
                  <h3>RAKİP SKORU</h3>
                  <div className="score-value">{opponentScore}</div>
                  <p>{opponentUsername || 'Rakip'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="score-container-single">
              <span>Süre: <span data-testid="single-timer">{timeLeft}</span>s</span>
              <span>Mod: <span data-testid="single-mode">{mode}</span></span>
              <span>Puan: <span data-testid="single-score">{score}</span></span>
            </div>
          )}

          {combo >= COMBO_THRESHOLD && (
            <div className="combo-display" data-testid="combo-display">
              🔥 x{combo} SERİ!
            </div>
          )}

          <div className="character-container" onClick={hitCharacter} data-testid="character-container">
            <div className="name-tag">Yiğit</div>
            <div className="character">
              <div className="human-face">
                <div className="human-eyes">
                  <div className="eye"><div className="pupil"></div></div>
                  <div className="eye"><div className="pupil"></div></div>
                </div>
              </div>
            </div>
          </div>

          {autoClickerActive && (
            <div className="auto-click-status" data-testid="auto-click-status">
              ⚡ J-Hilesi Aktif!
            </div>
          )}
        </div>
      )}

      {screen === 'end' && (
        <div className="screen" data-testid="end-screen">
          <h2 className="end-title">
            {mode === 'Online Mod' 
              ? (score > opponentScore ? '🏆 KAZANDINIZ!' : score < opponentScore ? '❌ KAYBETTİNİZ!' : '➖ BERABERE!')
              : 'Oyun Bitti!'
            }
          </h2>
          <p>Mod: {mode}</p>
          <p>Sizin Vuruşunuz: <span className="final-score" data-testid="final-player-score">{score}</span></p>
          {mode === 'Online Mod' && (
            <p>Rakip Vuruşu: <span className="final-score" data-testid="final-opponent-score">{opponentScore}</span></p>
          )}
          <button className="btn btn-restart" onClick={() => setScreen('start')} data-testid="restart-button">
            Tekrar Oyna / Ana Menü
          </button>
        </div>
      )}

      {showRecords && (
        <div className="records-modal" onClick={() => setShowRecords(false)} data-testid="records-modal">
          <div className="records-content" onClick={(e) => e.stopPropagation()}>
            <h2>🏆 Yüksek Skor Kayıtları</h2>
            {records.length === 0 ? (
              <p>Henüz kayıt yok. Oyna ve ilk kaydını oluştur!</p>
            ) : (
              <ul className="records-list">
                {records.map((record, index) => (
                  <li key={record.id} data-testid={`record-item-${index}`}>
                    <span>#{index + 1} - {record.mode} ({new Date(record.date).toLocaleDateString('tr-TR')})</span>
                    <span className="record-score">{record.score} Vuruş</span>
                  </li>
                ))}
              </ul>
            )}
            <button className="btn btn-close" onClick={() => setShowRecords(false)} data-testid="close-records-button">
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
