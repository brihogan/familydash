import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function ParentRoute() {
  const { user } = useAuth();
  return user?.role === 'parent' ? <Outlet /> : <Navigate to="/dashboard" replace />;
}
