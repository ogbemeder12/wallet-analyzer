
import React from 'react';
import { Separator } from '@/components/ui/separator';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="mt-auto py-6 px-4 bg-[#1A1F2C]/50 backdrop-blur-md border-t border-[#8B5CF6]/10">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <img 
              src="/lovable-uploads/38239a24-cd46-42d6-a421-87a64a33cfa4.png" 
              alt="SolanSight Logo" 
              className="h-8 w-8"
            />
            <span className="text-lg font-semibold bg-gradient-to-r from-[#8B5CF6] to-[#D946EF] bg-clip-text text-transparent">
              SolanSight
            </span>
          </div>
          
          <div className="text-sm text-muted-foreground">
            Analyze and visualize on-chain Solana transactions
          </div>
          
          <div className="text-sm text-muted-foreground">
            © {currentYear} SolanSight. All rights reserved.
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
