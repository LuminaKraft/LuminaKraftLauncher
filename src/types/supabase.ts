export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// Helper types for easier access
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Inserts<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type Updates<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          microsoft_id: string | null
          minecraft_uuid: string | null
          minecraft_username: string | null
          minecraft_username_history: Json | null
          discord_id: string | null
          discord_username: string | null
          discord_global_name: string | null
          discord_discriminator: string | null
          discord_avatar: string | null
          is_discord_member: boolean
          discord_member_since: string | null
          last_discord_sync: string | null
          discord_roles: Json | null
          has_partner_role: boolean
          partner_role_id: string | null
          linked_at: string | null
          display_name: string | null
          email: string | null
          role: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          microsoft_id?: string | null
          minecraft_uuid?: string | null
          minecraft_username?: string | null
          minecraft_username_history?: Json | null
          discord_id?: string | null
          discord_username?: string | null
          discord_global_name?: string | null
          discord_discriminator?: string | null
          discord_avatar?: string | null
          is_discord_member?: boolean
          discord_member_since?: string | null
          last_discord_sync?: string | null
          discord_roles?: Json | null
          has_partner_role?: boolean
          partner_role_id?: string | null
          linked_at?: string | null
          display_name?: string | null
          email?: string | null
          role?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          microsoft_id?: string | null
          minecraft_uuid?: string | null
          minecraft_username?: string | null
          minecraft_username_history?: Json | null
          discord_id?: string | null
          discord_username?: string | null
          discord_global_name?: string | null
          discord_discriminator?: string | null
          discord_avatar?: string | null
          is_discord_member?: boolean
          discord_member_since?: string | null
          last_discord_sync?: string | null
          discord_roles?: Json | null
          has_partner_role?: boolean
          partner_role_id?: string | null
          linked_at?: string | null
          display_name?: string | null
          email?: string | null
          role?: string
          created_at?: string
          updated_at?: string
        }
      }
    }
  }
}
