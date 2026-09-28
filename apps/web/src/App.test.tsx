// Smoke render: each route group mounts and says what it is.
import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import App from './App';

function render(path: string) {
  return renderToStaticMarkup(
    <StaticRouter location={path}>
      <App />
    </StaticRouter>,
  );
}

test('/console renders the team console shell, which checks the login before showing anything', () => {
  const html = render('/console');
  expect(html).toContain('class="console"');
  expect(html).toContain('One moment.');
});

test("/guru renders guruji's calendar, which asks the api for his day first", () => {
  const html = render('/guru');
  expect(html).toContain('class="guru"');
  expect(html).toContain('One moment.');
});

test('/s/:guruSlug renders his website preview, which asks the api for his page first', () => {
  const html = render('/s/guruji');
  expect(html).toContain('class="site"');
  expect(html).toContain('One moment.');
});
