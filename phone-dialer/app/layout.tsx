import './globals.css';

export const metadata = {
  title: 'Phone Dialer App',
  description: 'Make calls with your Next.js phone dialer',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}