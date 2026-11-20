import * as React from "react";
import { Link as RouterLink, useLocation, useNavigate, useParams as useRouterParams } from "react-router-dom";

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean };

export function Link({ href, prefetch, children, ...props }: LinkProps) {
  return (
    <RouterLink to={href} {...props}>
      {children}
    </RouterLink>
  );
}

export default Link;

export function useRouter() {
  const navigate = useNavigate();
  return React.useMemo(
    () => ({
      push: (href: string) => void navigate(href),
      replace: (href: string) => void navigate(href, { replace: true }),
      back: () => void navigate(-1),
      refresh: () => window.location.reload(),
      prefetch: async () => {},
    }),
    [navigate],
  );
}

export function usePathname() {
  return useLocation().pathname;
}

export function useParams<T extends Record<string, string | string[]>>() {
  return useRouterParams() as T;
}

export function useSearchParams() {
  const location = useLocation();
  return React.useMemo(() => new URLSearchParams(location.search), [location.search]);
}
