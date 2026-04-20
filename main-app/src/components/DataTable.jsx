const SAMPLE_DATA = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'Admin', status: 'active' },
  { id: 2, name: 'Bob Smith', email: 'bob@example.com', role: 'Editor', status: 'active' },
  { id: 3, name: 'Charlie Brown', email: 'charlie@example.com', role: 'Viewer', status: 'inactive' },
  { id: 4, name: 'Diana Prince', email: 'diana@example.com', role: 'Editor', status: 'active' },
  { id: 5, name: 'Eve Wilson', email: 'eve@example.com', role: 'Viewer', status: 'inactive' },
];

/**
 * Data table component showing team members list.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export default function DataTable() {
  return (
    <div className="data-table-container">
      <h3>Team Members</h3>
      <table className="data-table" id="members-table" data-testid="data-table">
        <thead>
          <tr>
            <th>Full Name</th>
            <th>Email Address</th>
            <th>Position</th>
            <th>State</th>
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
                  {user.status === 'active' ? 'Enabled' : 'Disabled'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
