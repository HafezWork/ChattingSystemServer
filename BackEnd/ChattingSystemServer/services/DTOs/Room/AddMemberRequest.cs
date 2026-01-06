using ChatServerMVC.Models;

namespace ChatServerMVC.services.DTOs.Room
{
    public class AddMemberRequest
    {
            public List<Guid> Users { get; set; }
            public List<KeyEntry> EncryptionKeys { get; set; }
    }
}
