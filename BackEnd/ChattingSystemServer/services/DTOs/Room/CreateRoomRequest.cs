using ChatServerMVC.Models;

namespace ChatServerMVC.services.DTOs.Room
{
    public class CreateRoomRequest
    {
        public string Name { get; set; }
        public Guid Creator { get; set; }
        public List<Guid> Users { get; set; }
        public List<KeyEntry> EncryptionKeys { get; set; }
    }
}
