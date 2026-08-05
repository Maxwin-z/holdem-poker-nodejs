import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { store } from './app/store';
import { Provider } from 'react-redux';
import * as serviceWorker from './serviceWorker';

// Keep browser-managed undo/redo (including iOS shake-to-undo) from changing
// controlled game inputs behind React's state. Native iOS owns the shake alert
// itself, but cancelling beforeinput prevents the requested edit from applying.
document.addEventListener('beforeinput', (event) => {
  const inputEvent = event as InputEvent;
  if (
    inputEvent.inputType === 'historyUndo' ||
    inputEvent.inputType === 'historyRedo'
  ) {
    event.preventDefault();
  }
}, true);

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
