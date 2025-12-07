import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import "@/App.css";
import Home from "@/pages/Home";
import Game from "@/pages/Game";
import Leaderboard from "@/pages/Leaderboard";
import Achievements from "@/pages/Achievements";
import { Toaster } from "@/components/ui/sonner";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-dark-bg text-white">Yükleniyor...</div>;
  }

  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={user ? <Game user={user} logout={logout} /> : <Home setUser={setUser} />} />
          <Route path="/leaderboard" element={<Leaderboard user={user} />} />
          <Route path="/achievements" element={user ? <Achievements user={user} /> : <Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </div>
  );
}

export default App;
