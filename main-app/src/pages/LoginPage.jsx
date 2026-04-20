import { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppContext } from '../App';

/**
 * Login page.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export default function LoginPage() {
  const { login } = useContext(AppContext);
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

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
        <h1>Welcome</h1>
        <p className="subtitle">Please sign in to your account</p>

        {error && (
          <div className="error-message" data-testid="error-msg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="text"
              id="email"
              name="email"
              placeholder="Enter your email"
              aria-label="Email Address"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label htmlFor="pass-field">Password</label>
            <input
              type="password"
              id="pass-field"
              name="pass-field"
              placeholder="Enter your secret password"
              aria-label="Password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          <button
            type="submit"
            id="signin-btn"
            className="btn-primary"
            data-action="login"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
