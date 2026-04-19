import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App';

/**
 * Login page with two UI versions.
 * V1: id="username", id="password", id="login-btn", text="Login"
 * V2: id="email", id="pass-field", id="signin-btn", text="Sign in"
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export default function LoginPage() {
  const { login, uiVersion } = useContext(AppContext);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

  const isV1 = uiVersion === 1;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!formData.username || !formData.password) {
      setError('Please fill in all fields');
      return;
    }

    if (formData.username === 'admin' && formData.password === 'admin123') {
      login(formData.username);
      navigate('/dashboard');
    } else {
      setError('Invalid credentials');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card" data-testid="login-form">
        <h1>
          {isV1 ? 'Welcome Back' : 'Welcome'}
          <span className="version-badge">UI v{uiVersion}</span>
        </h1>
        <p className="subtitle">
          {isV1 ? 'Please login to continue' : 'Please sign in to your account'}
        </p>

        {error && (
          <div className="error-message" data-testid="error-msg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor={isV1 ? 'username' : 'email'}>
              {isV1 ? 'Username' : 'Email Address'}
            </label>
            <input
              type="text"
              id={isV1 ? 'username' : 'email'}
              name={isV1 ? 'username' : 'email'}
              placeholder={isV1 ? 'Enter your username' : 'Enter your email'}
              aria-label={isV1 ? 'Username' : 'Email Address'}
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor={isV1 ? 'password' : 'pass-field'}>
              Password
            </label>
            <input
              type="password"
              id={isV1 ? 'password' : 'pass-field'}
              name={isV1 ? 'password' : 'pass-field'}
              placeholder={isV1 ? 'Enter your password' : 'Enter your secret password'}
              aria-label="Password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <button
            type="submit"
            id={isV1 ? 'login-btn' : 'signin-btn'}
            className="btn-primary"
            data-action="login"
          >
            {isV1 ? 'Login' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
