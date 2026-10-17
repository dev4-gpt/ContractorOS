import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { LandingPage } from './LandingPage';
import '../index.css';

const root = document.getElementById('root')!;
if (root.firstElementChild) {
  hydrateRoot(root, <LandingPage />);
} else {
  createRoot(root).render(<LandingPage />);
}
