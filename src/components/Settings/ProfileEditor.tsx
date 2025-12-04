import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { User as UserIcon, Pencil, X, Check } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { DiscordAccount } from '../../types/launcher';
import { supabase, updateUser } from '../../services/supabaseClient';

interface ProfileEditorProps {
  luminaKraftUser: User;
  discordAccount: DiscordAccount | null;
  onUpdate: () => void;
}

const ProfileEditor: React.FC<ProfileEditorProps> = ({ luminaKraftUser, discordAccount, onUpdate }) => {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(luminaKraftUser.user_metadata?.display_name || '');
  const [isEditing, setIsEditing] = useState(false);
  const [tempDisplayName, setTempDisplayName] = useState(displayName);

  const handleStartEdit = () => {
    setTempDisplayName(displayName);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setTempDisplayName(displayName);
    setIsEditing(false);
  };

  const handleUpdateDisplayName = async () => {
    if (!tempDisplayName.trim()) {
      toast.error('Display name cannot be empty');
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: tempDisplayName }
      });

      if (error) throw error;

      // Also update in public.users table
      await updateUser(luminaKraftUser.id, { display_name: tempDisplayName });

      setDisplayName(tempDisplayName);
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      console.error('Error updating display name:', error);
      toast.error('Failed to update display name');
    }
  };

  const getProfilePicture = () => {
    if (luminaKraftUser.user_metadata?.avatar_url) {
      return luminaKraftUser.user_metadata.avatar_url;
    }

    if (discordAccount?.avatar) {
      return `https://cdn.discordapp.com/avatars/${discordAccount.id}/${discordAccount.avatar}.webp`;
    }

    return null;
  };

  const profilePic = getProfilePicture();

  return (
    <div className="flex items-center space-x-4 mb-6 p-4 bg-dark-700/50 rounded-lg border border-dark-600">
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {profilePic ? (
           <img
             src={profilePic}
             alt="Profile"
             className="w-16 h-16 rounded-full object-cover border-2 border-lumina-600/50 shadow-lg"
           />
        ) : (
           <div className="w-16 h-16 bg-dark-700 rounded-full flex items-center justify-center border-2 border-dark-500">
              <UserIcon className="w-8 h-8 text-dark-400" />
           </div>
        )}
      </div>

      {/* Info & Edit */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mb-1">
          {t('settings.displayName')}
        </p>
        
        {isEditing ? (
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={tempDisplayName}
              onChange={(e) => setTempDisplayName(e.target.value)}
              className="flex-1 px-3 py-1 bg-dark-800 border border-lumina-500 rounded focus:outline-none text-white text-sm"
              placeholder="Display Name"
              autoFocus
            />
            <button onClick={handleUpdateDisplayName} className="p-1.5 bg-green-600/20 text-green-400 rounded hover:bg-green-600/30">
              <Check size={16} />
            </button>
            <button onClick={handleCancelEdit} className="p-1.5 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30">
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2 group">
            <h3 className="text-xl font-bold text-white truncate">{displayName || 'User'}</h3>
            <button 
              onClick={handleStartEdit}
              className="p-1.5 text-gray-500 hover:text-lumina-400 opacity-0 group-hover:opacity-100 transition-opacity"
              title={t('settings.edit')}
            >
              <Pencil size={14} />
            </button>
          </div>
        )}
        
        <p className="text-sm text-gray-500 mt-1 truncate">{luminaKraftUser.email}</p>
      </div>
    </div>
  );
};

export default ProfileEditor;
