import { useContext } from 'react';
import { AppContext } from '../App';
import Navbar from '../components/Navbar';
import DataTable from '../components/DataTable';

/**
 * Dashboard page with stats and data table.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export default function DashboardPage() {
  const { currentUser } = useContext(AppContext);

  return (
    <>
      <Navbar />
      <div className="dashboard-container">
        <h2 id="home-title" data-testid="page-title">Home Overview</h2>

        <div className="stats-grid">
          <div className="stat-card" id="member-count">
            <div className="stat-label">Members</div>
            <div className="stat-value" data-testid="stat-users">1,234</div>
          </div>
          <div className="stat-card" id="live-sessions">
            <div className="stat-label">Live Sessions</div>
            <div className="stat-value" data-testid="stat-sessions">56</div>
          </div>
          <div className="stat-card" id="analytics">
            <div className="stat-label">Analytics</div>
            <div className="stat-value" data-testid="stat-reports">89</div>
          </div>
        </div>

        <DataTable />
      </div>
    </>
  );
}
