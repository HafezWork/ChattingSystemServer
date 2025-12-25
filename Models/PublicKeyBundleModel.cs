namespace ChatServerMVC.Models
{
    public class PublicKeyBundleModel
    {
        public Guid UserId { get; set; }
        public required byte[] IdentityKey { get; set; }

        public required byte[] SignedPreKey { get; set; }
        public required byte[] SignedPreKeySignature { get; set; }

    }
}
