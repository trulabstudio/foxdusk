// The phone menu, shared by the homepage and the work page.
(() => {
  'use strict';

  const button = document.getElementById('menuButton');
  const nav = document.getElementById('mainNav');
  const root = document.documentElement;

  function setOpen(open) {
    nav.classList.toggle('open', open);
    root.classList.toggle('menu-open', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  button.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('open')) {
      setOpen(false);
      button.focus();
    }
  });
  // Turning a phone sideways can land on the desktop layout, which has no open state.
  matchMedia('(min-width: 961px)').addEventListener('change', (event) => {
    if (event.matches) setOpen(false);
  });
})();
