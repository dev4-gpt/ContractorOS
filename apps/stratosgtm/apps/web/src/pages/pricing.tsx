import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { PricingPage } from './PricingPage';
import '../index.css';

const root = document.getElementById('root')!;
if (root.firstElementChild) {
  hydrateRoot(root, <PricingPage />);
} else {
  createRoot(root).render(<PricingPage />);
}
