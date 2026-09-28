import { Link } from 'react-router-dom';
import { useWords } from './lang';

// Level two. What the team looks at weekly or sets once, out of the way of the day's work.
export default function More() {
  const W = useWords();
  return (
    <>
      <header className="bar"><h1>{W.more.title}</h1></header>
      <div className="more">
        <Link className="more-card" to="/console/money"><b>{W.more.moneyTitle}</b><span className="muted">{W.more.moneyLine}</span></Link>
        <Link className="more-card" to="/console/settings"><b>{W.more.settingsTitle}</b><span className="muted">{W.more.settingsLine}</span></Link>
      </div>
    </>
  );
}
