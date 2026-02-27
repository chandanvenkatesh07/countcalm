import './globals.css';

export const metadata = { title: 'Portfolio Tracker MVP' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
