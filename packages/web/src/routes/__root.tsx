import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';
import styles from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'jledger · Your money, in focus' },
      {
        name: 'description',
        content:
          'A private, local-first explorer for plain text accounting journals.',
      },
    ],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  shellComponent: ({ children }) => (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  ),
});
