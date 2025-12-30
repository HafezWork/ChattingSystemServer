using System.ComponentModel.DataAnnotations.Schema;

namespace ChatServerMVC.Models
{
    [Table("EncryptionKeys")]
    public class EncryptionKeyModel
    {
        public Guid RoomId { get; set; }
        public RoomModel Room { get; set; } = null!;
        public Guid UserId { get; set; }
        public UserModel User { get; set; } = null!;
        public byte[] Key { get; set; } = null!;
        public int KeyVersion { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
