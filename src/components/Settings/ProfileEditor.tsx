import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { User as UserIcon } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import type { DiscordAccount } from '../../types/launcher';

interface ProfileEditorProps {
  luminaKraftUser: User;
  discordAccount: DiscordAccount | null;
  onUpdate: () => void;
}

const ProfileEditor: React.FC<ProfileEditorProps> = ({ luminaKraftUser, discordAccount, onUpdate }) => {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(luminaKraftUser.user_metadata?.display_name || '');

  const handleUpdateDisplayName = async () => {
    if (!displayName.trim()) {
      toast.error('Display name cannot be empty');
      return;
    }

    try {
      const { supabase, updateUser } = await import('../../services/supabaseClient');
      const { error } = await supabase.auth.updateUser({
        data: { display_name: displayName }
      });

      if (error) throw error;

      // Also update in public.users table
      await updateUser(luminaKraftUser.id, { display_name: displayName });

      toast.success('Display name updated!');
      onUpdate();
    } catch (error) {
      console.error('Error updating display name:', error);
      toast.error('Failed to update display name');
    }
  };

  const getProfilePicture = () => {
    // Priority: Custom upload (if exists from before) > Discord avatar > Default
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
    <div className="space-y-6">
      {/* Profile Picture - View Only */}
      <div>
        <label className="block text-sm font-medium mb-2 text-gray-300">{t('settings.profilePicture')}</label>
        <div className="flex items-center space-x-4">
          {profilePic ? (
             <img
               src={profilePic}
               alt="Profile"
               className="w-16 h-16 rounded-full object-cover border-2 border-dark-600"
             />
          ) : (
             <div className="w-16 h-16 bg-dark-700 rounded-full flex items-center justify-center border-2 border-dark-600">
                <UserIcon className="w-8 h-8 text-dark-400" />
             </div>
          )}
          
          <div className="flex-1">
            <p className="text-sm text-gray-400">
              {discordAccount
                ? t('settings.usingDiscordAvatar')
                : 'Profile picture is managed by your linked account.'}
            </p>
          </div>
        </div>
      </div>

      {/* Display Name */}
      <div>
        <label className="block text-sm font-medium mb-2 text-gray-300">{t('settings.displayName')}</label>
        <div className="flex space-x-2">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            onBlur={handleUpdateDisplayName}
            className="flex-1 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg focus:ring-2 focus:ring-lumina-400 text-white placeholder-gray-500"
            placeholder="Your display name"
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {t('settings.displayNameDesc')}
        </p>
      </div>
    </div>
  );
};

export default ProfileEditor;