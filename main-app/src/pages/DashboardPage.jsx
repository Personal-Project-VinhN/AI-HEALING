import { useContext } from 'react';
import { AppContext } from '../App';
import Navbar from '../components/Navbar';
import DataTable from '../components/DataTable';

/**
 * Dashboard page with stats and data table.
 * V1: id="dashboard-title", stat IDs: total-users, active-sessions, reports
 * V2: id="home-title", stat IDs: member-count, live-sessions, analytics
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export default function DashboardPage() {
  const { currentUser, uiVersion } = useContext(AppContext);
  const isV1 = uiVersion === 1;

  return (
    <>
      <Navbar />
      <div className="dashboard-container">
        <h2 id={isV1 ? 'dashboard-title' : 'home-title'} data-testid="page-title">
          {isV1 ? 'Dashboard' : 'Home Overview'}
        </h2>

        <div className="stats-grid">
          <div className="stat-card" id={isV1 ? 'total-users' : 'member-count'}>
            <div className="stat-label">{isV1 ? 'Total Users' : 'Members'}</div>
            <div className="stat-value" data-testid="stat-users">1,234</div>
          </div>
          <div className="stat-card" id={isV1 ? 'active-sessions' : 'live-sessions'}>
            <div className="stat-label">{isV1 ? 'Active Sessions' : 'Live Sessions'}</div>
            <div className="stat-value" data-testid="stat-sessions">56</div>
          </div>
          <div className="stat-card" id={isV1 ? 'reports' : 'analytics'}>
            <div className="stat-label">{isV1 ? 'Reports' : 'Analytics'}</div>
            <div className="stat-value" data-testid="stat-reports">89</div>
          </div>
        </div>

        <DataTable />
      </div>
    </>
  );
}
