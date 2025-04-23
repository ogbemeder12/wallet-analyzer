
import React, { useState, useEffect } from 'react';
import { Building, FileCode, User, AlertTriangle, BadgeCheck, Globe, Wallet, ArrowRightLeft, Image } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { getEntityIdentificationSync, getEntityIdentification } from '@/utils/entityLabeling';

interface EntityLabelProps {
  address: string;
  showAddress?: boolean;
  showTooltip?: boolean;
  className?: string;
}

const EntityLabel: React.FC<EntityLabelProps> = ({ 
  address, 
  showAddress = false,
  showTooltip = true,
  className = ''
}) => {
  const [entity, setEntity] = useState(getEntityIdentificationSync(address));
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    const fetchEntityData = async () => {
      setLoading(true);
      try {
        const fullEntity = await getEntityIdentification(address);
        setEntity(fullEntity);
      } catch (error) {
        console.error('Error fetching entity data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchEntityData();
  }, [address]);
  
  const getIconForEntityType = () => {
    if (entity.isExchange) return <Building size={14} />;
    if (entity.isProject) return <Globe size={14} />;
    if (entity.type === 'core-protocol') return <FileCode size={14} />;
    if (entity.type === 'dex') return <ArrowRightLeft size={14} />;
    if (entity.type === 'nft-protocol' || entity.type === 'nft-marketplace') return <Image size={14} />;
    return <Wallet size={14} />;
  };
  
  const getBadgeColor = () => {
    if (entity.isExchange) return 'bg-blue-500/10 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400';
    if (entity.isProject) return 'bg-purple-500/10 text-purple-600 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400';
    if (entity.isKnownEntity) return 'bg-green-500/10 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-400';
    return '';
  };
  
  // If no entity identified, return just the address if requested
  if (!entity.name) {
    return showAddress ? (
      <span className={`font-mono text-sm ${className}`}>{address.substring(0, 8)}...</span>
    ) : null;
  }
  
  const label = (
    <Badge variant="outline" className={`flex items-center gap-1 ${getBadgeColor()} ${className}`}>
      {getIconForEntityType()}
      <span>{entity.name}</span>
      {'isVerified' in entity && entity.isVerified && <BadgeCheck size={12} className="ml-1 text-blue-500" />}
      {showAddress && <span className="font-mono ml-1 opacity-70">{`(${address.substring(0, 6)}...)`}</span>}
    </Badge>
  );
  
  if (!showTooltip) return label;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {label}
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1">
            <p className="font-medium">{entity.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{entity.type || (entity.isExchange ? 'Exchange' : 'Project')}</p>
            <p className="text-xs font-mono">{address}</p>
            {'isVerified' in entity && entity.isVerified && (
              <p className="text-xs flex items-center text-blue-500">
                <BadgeCheck size={12} className="mr-1" /> Verified Entity
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default EntityLabel;
