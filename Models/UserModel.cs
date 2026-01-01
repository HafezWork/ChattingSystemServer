using System.ComponentModel.DataAnnotations.Schema;

namespace ChatServerMVC.Models
{
    [Table("Users")]
    public class UserModel
    {
        public required Guid Id  { get; set; }
        public required string UserName { get; set; }
        public string? DisplayName { get; set; }
        public bool Status { get; set; }
        public byte[] PasswordHash { get; set; }
        public byte[] PasswordSalt { get; set; }
        public DateTime LastSeen { get; set; } = DateTime.UtcNow;
        public byte[] PublicKey { get; set; }
        public ICollection<RoomMemberModel> RoomMembers { get; set; } = new List<RoomMemberModel>();
        public ICollection<EncryptionKeyModel> EncryptionKeys { get; set; }
    = new List<EncryptionKeyModel>();
    }
}
