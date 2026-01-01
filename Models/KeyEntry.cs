namespace ChatServerMVC.Models
{
    public class KeyEntry
    {
        public Guid UserId { get; set; }     // corresponds to the user
        public byte[] Key { get; set; }      // the actual encrypted key
    }
}
