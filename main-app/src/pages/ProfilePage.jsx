import { useContext, useState } from 'react';
import { AppContext } from '../App';
import Navbar from '../components/Navbar';

/**
 * Profile / Create User form page.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export default function ProfilePage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (field) => (e) => {
    setFormData({ ...formData, [field]: e.target.value });
    setSubmitted(false);
    setError('');
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (!formData.firstName || !formData.lastName || !formData.email) {
      setError('Please fill in all required fields');
      return;
    }
    setSubmitted(true);
  };

  const handleCancel = () => {
    setFormData({ firstName: '', lastName: '', email: '', role: '' });
    setSubmitted(false);
    setError('');
  };

  return (
    <>
      <Navbar />
      <div className="profile-container">
        <h2 data-testid="page-title">Add New Member</h2>

        <div className="profile-card">
          <form onSubmit={handleSave} id="member-form" data-testid="profile-form">
            {error && (
              <div className="error-message" data-testid="form-error">{error}</div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="fname">Given Name</label>
                <input
                  type="text"
                  id="fname"
                  name="fname"
                  placeholder="Your given name"
                  aria-label="Given Name"
                  value={formData.firstName}
                  onChange={handleChange('firstName')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="lname">Family Name</label>
                <input
                  type="text"
                  id="lname"
                  name="lname"
                  placeholder="Your family name"
                  aria-label="Family Name"
                  value={formData.lastName}
                  onChange={handleChange('lastName')}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="contact-email">Contact Email</label>
                <input
                  type="email"
                  id="contact-email"
                  name="contact-email"
                  placeholder="email@company.com"
                  aria-label="Contact Email"
                  value={formData.email}
                  onChange={handleChange('email')}
                />
              </div>
              <div className="form-group">
                <label htmlFor="position">Position</label>
                <select
                  id="position"
                  name="position"
                  aria-label="Position"
                  value={formData.role}
                  onChange={handleChange('role')}
                >
                  <option value="">Choose position</option>
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>

            <div className="btn-group">
              <button
                type="submit"
                id="submit-btn"
                className="btn-save"
                data-action="save"
              >
                Submit
              </button>
              <button
                type="button"
                id="discard-btn"
                className="btn-cancel"
                onClick={handleCancel}
                data-action="cancel"
              >
                Discard
              </button>
            </div>
          </form>

          {submitted && (
            <div className="success-message" data-testid="success-message">
              Member has been added successfully!
            </div>
          )}
        </div>
      </div>
    </>
  );
}
