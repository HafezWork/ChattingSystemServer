namespace ChatServerMVC.Models
{
    public class UserModel
    {
        public required Guid Id  { get; set; }
        public required string UserName { get; set; }
        public string? DisplayName { get; set; }
        public bool Status { get; set; }
        public DateTime LastSeen { get; set; } = DateTime.UtcNow;
    }
}
