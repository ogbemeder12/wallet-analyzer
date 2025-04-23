
import React from 'react';
import { Info, ChevronRight } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';

const InstructionsDrawer = () => {
  return (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <Button 
          size="sm" 
          variant="outline" 
          className="fixed right-4 top-1/2 -translate-y-1/2 z-50 rounded-full p-2 shadow-md"
          aria-label="Instructions"
        >
          <Info className="h-4 w-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="right-0 left-auto w-80 sm:w-96 h-full fixed rounded-l-lg">
        <DrawerHeader>
          <DrawerTitle className="text-center">How to Use This App</DrawerTitle>
        </DrawerHeader>
        <div className="px-6 pb-6 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <h3 className="font-medium">1. Search for a Wallet</h3>
            <p className="text-sm text-muted-foreground">
              Enter a Solana wallet address or transaction signature in the search bar at the top of the page.
            </p>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-medium">2. Explore Transactions</h3>
            <p className="text-sm text-muted-foreground">
              View all transactions associated with the address. Click on any transaction to see its details.
            </p>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-medium">3. Analyze Transaction Flow</h3>
            <p className="text-sm text-muted-foreground">
              Use the transaction flow visualization to understand the relationship between different wallets and funds.
            </p>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-medium">4. Check Anomalies</h3>
            <p className="text-sm text-muted-foreground">
              The system automatically detects suspicious activities and highlights them as anomalies.
            </p>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-medium">5. View Analytics</h3>
            <p className="text-sm text-muted-foreground">
              Switch to the Analytics tab to see charts and statistics about transaction patterns.
            </p>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-medium">6. Entity Analysis</h3>
            <p className="text-sm text-muted-foreground">
              Explore the Entities tab to see known entities and their relationship with the wallet.
            </p>
          </div>
          
          <div className="space-y-2">
            <h3 className="font-medium">Try a Sample Address</h3>
            <p className="text-sm text-muted-foreground">
              Not sure where to start? Try searching for this sample address: 
              <span className="block mt-1 font-mono text-xs break-all">GVV4cVPRhUf9wQQRbQu9JwQPQkRtFKrNYGPXgxzk5mUC</span>
            </p>
          </div>
        </div>
        <DrawerFooter>
          <Button variant="outline" className="w-full">
            <ChevronRight className="mr-2 h-4 w-4" />
            Close Instructions
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default InstructionsDrawer;
