import { Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import GiveawaysPage from './pages/GiveawaysPage.jsx';
import GiveawayDetailPage from './pages/GiveawayDetailPage.jsx';
import WinnersPage from './pages/WinnersPage.jsx';
import EarnVesPage from './pages/EarnVesPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="giveaways" element={<GiveawaysPage />} />
        <Route path="giveaways/:slug" element={<GiveawayDetailPage />} />
        <Route path="winners" element={<WinnersPage />} />
        <Route path="earn" element={<EarnVesPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
