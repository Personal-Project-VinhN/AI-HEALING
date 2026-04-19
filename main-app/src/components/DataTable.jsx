import { useContext } from 'react';
import { AppContext } from '../App';

const SAMPLE_DATA = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'Admin', status: 'active' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'Editor', status: 'active' },
  { id: 3, name: 'Charlie Brown', email: 'charlie@example.com', role: 'Viewer', status: 'inactive' },
  { id: 4, name: 'Diana Prince', email: 'diana@example.com', role: 'Editor', status: 'active' },
  { id: 5, name: 'Eve Wilson', email: 'eve@example.com', role: 'Viewer', status: 'inactive' },
];

/**
 * Data table component showing user list.
 * V1: id="user-table", columns: Name/Email/Role/Status
 * V2: id="members-table", columns: Full Name/Email Address/Position/State
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export default function DataTable() {
  const { uiVersion } = useContext(AppContext);
  const isV1 = uiVersion === 1;

  return (
    <div className="data-table-container">
      <h3>{isV1 ? 'User List' : 'Team Members'}</h3>
      <table className="data-table" id={isV1 ? 'user-table' : 'members-table'} data-testid="data-table">
        <thead>
          <tr>
            <th>{isV1 ? 'Name' : 'Full Name'}</th>
            <th>{isV1 ? 'Email' : 'Email Address'}</th>
            <th>{isV1 ? 'Role' : 'Position'}</th>
            <th>{isV1 ? 'Status' : 'State'}</th>
          </tr>
        </thead>
        <tbody>
          {SAMPLE_DATA.map((user) => (
            <tr key={user.id} data-user-id={user.id}>
              <td>{user.name}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td>
                <span className={`badge badge-${user.status}`}>
                  {user.status === 'active'
                    ? (isV1 ? 'Active' : 'Enabled')
                    : (isV1 ? 'Inactive' : 'Disabled')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
