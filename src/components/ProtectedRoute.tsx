
import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUser } from '@civic/auth/react';

type ProtectedRouteProps = {
  children: React.ReactNode;
};

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user } = useUser();

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};
