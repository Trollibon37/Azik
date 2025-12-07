import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ACHIEVEMENT_ICONS = {
  'İlk Vuruş': '🎯',
  '10 Vuruş': '💪',
  '50 Vuruş': '🔥',
  '100 Vuruş': '⚡',
  'Kombo Ustası': '🏆'
};

const ALL_ACHIEVEMENTS = [
  { name: 'İlk Vuruş', description: 'İlk vuruşunu yap', condition: '1+ vuruş' },
  { name: '10 Vuruş', description: '10 vuruşa ulaş', condition: '10+ vuruş' },
  { name: '50 Vuruş', description: '50 vuruşa ulaş', condition: '50+ vuruş' },
  { name: '100 Vuruş', description: '100 vuruşa ulaş', condition: '100+ vuruş' },
  { name: 'Kombo Ustası', description: '200 vuruşa ulaş', condition: '200+ vuruş' }
];

export default function Achievements({ user }) {
  const [achievements, setAchievements] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadAchievements();
  }, []);

  const loadAchievements = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/achievements`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAchievements(response.data);
    } catch (error) {
      console.error('Başarımlar yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const isUnlocked = (achievementName) => {
    return achievements.some(a => a.achievement_name === achievementName);
  };

  return (
    <div className="achievements-container">
      <div className="achievements-content">
        <h1 className="achievements-title">🏅 Başarımlar</h1>
        
        {loading ? (
          <p className="loading-text">Yükleniyor...</p>
        ) : (
          <>
            <div className="achievements-stats">
              <p>{achievements.length} / {ALL_ACHIEVEMENTS.length} Başarım Açıldı</p>
            </div>
            
            <div className="achievements-grid">
              {ALL_ACHIEVEMENTS.map((ach, index) => {
                const unlocked = isUnlocked(ach.name);
                return (
                  <div 
                    key={index} 
                    className={`achievement-card ${unlocked ? 'unlocked' : 'locked'}`}
                    data-testid={`achievement-${index}`}
                  >
                    <div className="achievement-icon">
                      {unlocked ? ACHIEVEMENT_ICONS[ach.name] : '🔒'}
                    </div>
                    <h3>{ach.name}</h3>
                    <p className="achievement-description">{ach.description}</p>
                    <p className="achievement-condition">{ach.condition}</p>
                    {unlocked && (
                      <div className="unlocked-badge">✓ Açıldı</div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <button 
          className="btn btn-back" 
          onClick={() => navigate('/')}
          data-testid="back-to-game-button"
        >
          Oyuna Dön
        </button>
      </div>
    </div>
  );
}
