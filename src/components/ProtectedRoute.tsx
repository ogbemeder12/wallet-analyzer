
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

type ProtectedRouteProps = {
  children: React.ReactNode;
};

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, session } = useAuth();

  if (!user || !session) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};
