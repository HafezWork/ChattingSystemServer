using System.ComponentModel.DataAnnotations.Schema;

namespace ChatServerMVC.Models
{
    [Table("Rooms")]
    public class RoomModel
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = null!;
        public Guid CreatedBy { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public ICollection<RoomMemberModel> Users { get; set; } = new List<RoomMemberModel>();
        public ICollection<MessageModel> Messages { get; set; } = new List<MessageModel>();
        public ICollection<EncryptionKeyModel> Keys { get; set; } = new List<EncryptionKeyModel>();


    }
}
