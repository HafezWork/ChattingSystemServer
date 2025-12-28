namespace ChatServerMVC.services.Interfaces
{
    public interface IKeyService
    {
        Task<byte[]> GetKey(Guid UserId, Guid RoomId);
        void RotateKey(Guid UserId, List<byte[]> Key);
    }
}
