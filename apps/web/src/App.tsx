import { Route, Routes } from 'react-router-dom';
import ConsoleShell from './console/ConsoleShell';
import GuruShell from './guru/GuruShell';
import SiteShell from './site/SiteShell';
import Join from './site/Join';
import FrontDoor from './FrontDoor';

// Three surfaces, three route groups. His website answers at the root of his own domain, where the
// api reads the tenant from the Host header; /s/:guruSlug is the same pages as an internal preview.
// On localhost the root is the dev index instead, because localhost is nobody's domain.
export default function App() {
  const onHisDomain = typeof window !== 'undefined' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  return (
    <Routes>
      <Route path="/console/*" element={<ConsoleShell />} />
      <Route path="/guru/*" element={<GuruShell />} />
      <Route path="/join/:bookingId" element={<Join />} />
      <Route path="/s/:guruSlug/join/:bookingId" element={<Join />} />
      <Route path="/s/:guruSlug/*" element={<SiteShell />} />
      {onHisDomain
        ? <Route path="/*" element={<SiteShell />} />
        : <Route path="/" element={<FrontDoor />} />}
    </Routes>
  );
}
