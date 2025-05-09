
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Footer from '@/components/Footer';
import { Loader } from 'lucide-react';
import { useUser } from '@civic/auth/react';

const Auth: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { user, signIn, signOut } = useUser();

  console.log(user);

  useEffect(() => {
    if (user) {
      navigate('/');
    } else {
      signIn();
    }
  }, [user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        toast.success('Logged in successfully');
        navigate('/');
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username: email.split('@')[0],
            }
          }
        });

        if (error) throw error;

        toast.success('Account created successfully. Please check your email for the confirmation link.');
        navigate('/');
      }
    } catch (error: any) {
      toast.error('Authentication error', {
        description: error.message
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-[#0F1729] to-[#1A1F2C]">
      <div className="flex-grow flex items-center justify-center p-4">
        {/* <Card className="w-full max-w-md glass-card border border-[#8B5CF6]/20 backdrop-blur-md bg-[#1A1F2C]/50">
          <CardHeader className="space-y-2 text-center">
            <div className="flex justify-center mb-4">
              <img
                src="/lovable-uploads/38239a24-cd46-42d6-a421-87a64a33cfa4.png"
                alt="SolanSight Logo"
                className="h-16 w-16"
              />
            </div>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-[#8B5CF6] to-[#D946EF] bg-clip-text text-transparent">
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </CardTitle>
            <CardDescription>
              {isLogin
                ? 'Enter your credentials to access your account'
                : 'Sign up to start analyzing Solana blockchain data'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="bg-[#1A1F2C]/80 border-[#8B5CF6]/20"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="bg-[#1A1F2C]/80 border-[#8B5CF6]/20"
                  disabled={isLoading}
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-[#8B5CF6] to-[#D946EF] hover:opacity-90"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader size={16} className="animate-spin" />
                    {isLogin ? 'Logging in...' : 'Creating account...'}
                  </span>
                ) : (
                  isLogin ? 'Login' : 'Create Account'
                )}
              </Button>
              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-[#8B5CF6]"
                  disabled={isLoading}
                >
                  {isLogin
                    ? 'Need an account? Sign Up'
                    : 'Already have an account? Login'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card> */}
      </div>
      <Footer />
    </div>
  );
};

export default Auth;
