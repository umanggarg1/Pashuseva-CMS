import { useLocation, useNavigate } from 'react-router-dom';

// Detail pages link back to a list (Orders, Customers, Products…) whose page/search/
// filter state now lives in the URL. Using browser history (navigate(-1)) restores
// that exact list state instead of a hardcoded link that always resets to page 1.
// location.key === 'default' means this tab has no in-app history to go back to
// (direct link, refresh, new tab) — fall back to a plain navigation in that case.
export function useSmartBack(fallback: string) {
  const location = useLocation();
  const navigate = useNavigate();

  return () => {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };
}
