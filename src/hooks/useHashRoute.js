import { useEffect, useState } from 'react'

export const ROUTES = ['dashboard', 'purchases', 'sales', 'inventory', 'suppliers', 'buyers', 'expenses', 'reports', 'settings']

const read = () => {
  const h = window.location.hash.replace(/^#\/?/, '')
  return ROUTES.includes(h) ? h : 'dashboard'
}

export function useHashRoute() {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => {
      setRoute(read())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export const navigate = (route) => {
  window.location.hash = `#/${route}`
}
