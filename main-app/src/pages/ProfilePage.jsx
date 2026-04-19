import { useContext, useState } from 'react';
import { AppContext } from '../App';
import Navbar from '../components/Navbar';

/**
 * Profile / Create User form page.
 * V1: id="first-name", id="last-name", id="user-email", id="user-role",
 *     id="save-btn" (text="Save"), id="cancel-btn" (text="Cancel")
 * V2: id="fname", id="lname", id="contact-email", id="position",
 *     id="submit-btn" (text="Submit"), id="discard-btn" (text="Discard")
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export default function ProfilePage() {
  const { uiVersion } = useContext(AppContext);
  const isV1 = uiVersion === 1;

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
        <h2 data-testid="page-title">
          {isV1 ? 'Create User' : 'Add New Member'}
        </h2>

        <div className="profile-card">
          <form
            onSubmit={handleSave}
            id={isV1 ? 'user-form' : 'member-form'}
            data-testid="profile-form"
          >
            {error && (
              <div className="error-message" data-testid="form-error">{error}</div>
            )}

            <div className="form-row">
              <div className="form-group">
                <label htmlFor={isV1 ? 'first-name' : 'fname'}>
                  {isV1 ? 'First Name' : 'Given Name'}
                </label>
                <input
                  type="text"
                  id={isV1 ? 'first-name' : 'fname'}
                  name={isV1 ? 'first-name' : 'fname'}
                  placeholder={isV1 ? 'Enter first name' : 'Your given name'}
                  aria-label={isV1 ? 'First Name' : 'Given Name'}
                  value={formData.firstName}
                  onChange={handleChange('firstName')}
                />
              </div>
              <div className="form-group">
                <label htmlFor={isV1 ? 'last-name' : 'lname'}>
                  {isV1 ? 'Last Name' : 'Family Name'}
                </label>
                <input
                  type="text"
                  id={isV1 ? 'last-name' : 'lname'}
                  name={isV1 ? 'last-name' : 'lname'}
                  placeholder={isV1 ? 'Enter last name' : 'Your family name'}
                  aria-label={isV1 ? 'Last Name' : 'Family Name'}
                  value={formData.lastName}
                  onChange={handleChange('lastName')}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor={isV1 ? 'user-email' : 'contact-email'}>
                  {isV1 ? 'Email' : 'Contact Email'}
                </label>
                <input
                  type="email"
                  id={isV1 ? 'user-email' : 'contact-email'}
                  name={isV1 ? 'user-email' : 'contact-email'}
                  placeholder={isV1 ? 'user@example.com' : 'email@company.com'}
                  aria-label={isV1 ? 'Email' : 'Contact Email'}
                  value={formData.email}
                  onChange={handleChange('email')}
                />
              </div>
              <div className="form-group">
                <label htmlFor={isV1 ? 'user-role' : 'position'}>
                  {isV1 ? 'Role' : 'Position'}
                </label>
                <select
                  id={isV1 ? 'user-role' : 'position'}
                  name={isV1 ? 'user-role' : 'position'}
                  aria-label={isV1 ? 'Role' : 'Position'}
                  value={formData.role}
                  onChange={handleChange('role')}
                >
                  <option value="">{isV1 ? 'Select role' : 'Choose position'}</option>
                  <option value="admin">Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>

            <div className="btn-group">
              <button
                type="submit"
                id={isV1 ? 'save-btn' : 'submit-btn'}
                className="btn-save"
                data-action="save"
              >
                {isV1 ? 'Save' : 'Submit'}
              </button>
              <button
                type="button"
                id={isV1 ? 'cancel-btn' : 'discard-btn'}
                className="btn-cancel"
                onClick={handleCancel}
                data-action="cancel"
              >
                {isV1 ? 'Cancel' : 'Discard'}
              </button>
            </div>
          </form>

          {submitted && (
            <div className="success-message" data-testid="success-message">
              {isV1
                ? 'User created successfully!'
                : 'Member has been added successfully!'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
