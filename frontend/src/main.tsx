import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ReviewPage from './ReviewPage';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root element not found');
}

const isReviewRoute = window.location.pathname === '/review';

createRoot(container).render(
  <StrictMode>
    {isReviewRoute ? <ReviewPage /> : <App />}
  </StrictMode>,
);
