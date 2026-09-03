import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { HomePage } from './pages/HomePage.js';
import { SettingsPage } from './pages/SettingsPage.js';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
