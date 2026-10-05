import { Link } from 'react-router';

/** Кнопка «назад» во вьюпорте — ведёт на главную. Общая для вьювера и сцены. */
export function BackButton() {
  return (
    <Link to="/" className="viewer__back" aria-label="На главную" data-hint="На главную">
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M13 8H3M7 4 3 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
