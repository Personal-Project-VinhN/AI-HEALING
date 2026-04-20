import { useContext } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AppContext } from '../App';

/**
 * Navigation bar component.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export default function Navbar() {
  const { currentUser, logout } = useContext(AppContext);
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <nav className="navbar" data-testid="navbar">
      <div className="brand">MyApplication</div>
      <div className="nav-links">
        <Link
          to="/dashboard"
          id="nav-home"
          className={location.pathname === '/dashboard' ? 'active' : ''}
        >
          Home
        </Link>
        <Link
          to="/profile"
          id="nav-account"
          className={location.pathname === '/profile' ? 'active' : ''}
        >
          My Account
        </Link>
        <span style={{ color: '#888', fontSize: '0.85rem' }}>
          Hi, {currentUser}
        </span>
        <button
          id="signout-btn"
          className="btn-logout"
          onClick={handleLogout}
          data-action="logout"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
