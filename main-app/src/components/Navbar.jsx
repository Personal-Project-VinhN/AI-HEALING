import { useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AppContext } from '../App';

/**
 * Navigation bar with version-aware link text and IDs.
 * V1: id="nav-dashboard", id="nav-profile", id="logout-btn"
 * V2: id="nav-home", id="nav-account", id="signout-btn"
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export default function Navbar() {
  const { currentUser, logout, uiVersion } = useContext(AppContext);
  const location = useLocation();
  const navigate = useNavigate();
  const isV1 = uiVersion === 1;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar" data-testid="navbar">
      <div className="brand">
        {isV1 ? 'MyApp' : 'MyApplication'}
        <span className="version-badge">v{uiVersion}</span>
      </div>
      <div className="nav-links">
        <Link
          to="/dashboard"
          id={isV1 ? 'nav-dashboard' : 'nav-home'}
          className={location.pathname === '/dashboard' ? 'active' : ''}
        >
          {isV1 ? 'Dashboard' : 'Home'}
        </Link>
        <Link
          to="/profile"
          id={isV1 ? 'nav-profile' : 'nav-account'}
          className={location.pathname === '/profile' ? 'active' : ''}
        >
          {isV1 ? 'Profile' : 'My Account'}
        </Link>
        <span style={{ color: '#888', fontSize: '0.85rem' }}>
          Hi, {currentUser}
        </span>
        <button
          id={isV1 ? 'logout-btn' : 'signout-btn'}
          className="btn-logout"
          onClick={handleLogout}
          data-action="logout"
        >
          {isV1 ? 'Logout' : 'Sign out'}
        </button>
      </div>
    </nav>
  );
}
