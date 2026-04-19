import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, createContext } from 'react';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import { getUIVersion } from './config/uiVersion';

export const AppContext = createContext();

/**
 * Root application component with routing and auth state.
 * Provides UI version context to all child components.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const uiVersion = getUIVersion();

  const login = (username) => {
    setIsLoggedIn(true);
    setCurrentUser(username);
  };

  const logout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
  };

  return (
    <AppContext.Provider value={{ isLoggedIn, currentUser, login, logout, uiVersion }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={isLoggedIn ? <DashboardPage /> : <Navigate to="/login" />}
          />
          <Route
            path="/profile"
            element={isLoggedIn ? <ProfilePage /> : <Navigate to="/login" />}
          />
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </BrowserRouter>
    </AppContext.Provider>
  );
}
