
import React from "react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import InstructionsDrawer from "./components/InstructionsDrawer";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import Footer from "./components/Footer";
import Header from "./components/Header";

// Create a query client for data fetching
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider 
          attribute="class" 
          defaultTheme="dark" 
          forcedTheme="dark"
          enableSystem={false}
        >
          <div className="min-h-screen bg-[#0F1729] dark:bg-[#0F1729] flex flex-col">
            <BrowserRouter>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route 
                  path="/" 
                  element={
                    <ProtectedRoute>
                      <div className="flex flex-col min-h-screen">
                        <Header />
                        <Index />
                        <Footer />
                      </div>
                    </ProtectedRoute>
                  } 
                />
                <Route path="*" element={
                  <div className="flex flex-col min-h-screen">
                    <Header />
                    <NotFound />
                    <Footer />
                  </div>
                } />
              </Routes>
              <InstructionsDrawer />
              <Toaster />
              <Sonner position="top-right" theme="dark" />
            </BrowserRouter>
          </div>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
