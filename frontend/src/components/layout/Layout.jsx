import { Outlet } from 'react-router-dom';
import Navbar from './Navbar.jsx';
import Footer from './Footer.jsx';
import DemoNotice from '../common/DemoNotice.jsx';
import { IS_DEMO } from '../../services/giveawayService.js';

export default function Layout() {
  return (
    <>
      <a className="vl-skip-link" href="#main">
        Skip to main content
      </a>
      <Navbar />
      {/* Ever-present honesty marker while the service layer runs on mocks. */}
      {IS_DEMO ? <DemoNotice variant="strip" /> : null}
      <main id="main">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
