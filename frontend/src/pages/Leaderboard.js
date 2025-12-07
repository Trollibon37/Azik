import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function Leaderboard({ user }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    try {
      const response = await axios.get(`${API}/leaderboard`);
      setLeaderboard(response.data);
    } catch (error) {
      console.error('Liderlik tablosu yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-content">
        <h1 className="leaderboard-title">🏆 Liderlik Tablosu</h1>
        
        {loading ? (
          <p className="loading-text">Yükleniyor...</p>
        ) : leaderboard.length === 0 ? (
          <p className="empty-text">Henüz liderlik tablosunda kimse yok. İlk olmak ister misin?</p>
        ) : (
          <div className="leaderboard-list">
            {leaderboard.map((entry, index) => (
              <div key={index} className={`leaderboard-item rank-${index + 1}`} data-testid={`leaderboard-item-${index}`}>
                <div className="rank-badge">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                </div>
                <div className="player-info">
                  <h3>{entry.username}</h3>
                  <p className="player-stats">
                    {entry.games_played} Oyun | En İyi: {entry.best_score || 0}
                  </p>
                </div>
                <div className="total-score">
                  {entry.total_score}
                  <span className="score-label">Toplam Puan</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <button 
          className="btn btn-back" 
          onClick={() => navigate('/')}
          data-testid="back-to-game-button"
        >
          {user ? 'Oyuna Dön' : 'Ana Sayfaya Dön'}
        </button>
      </div>
    </div>
  );
}
