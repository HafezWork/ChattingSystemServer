using System.Security.Policy;
using Microsoft.EntityFrameworkCore;

namespace ChatServerMVC.Models
{
    public class DataContext(string ConnectionString) : DbContext
    {
        private string _connectionString = ConnectionString;
        public DbSet<UserModel> Users { get; set; }
        public DbSet<MessageModel> Messages { get; set; }
        public DbSet<RoomModel> Rooms { get; set; }
        public DbSet<RoomMemberModel> RoomMembers { get; set; }
        public DbSet<EncryptionKeyModel> EncryptionKeys { get; set; }

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            optionsBuilder.UseMySQL(_connectionString);
        }
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<UserModel>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.UserName).IsRequired();
                entity.HasIndex(e => e.UserName).IsUnique();
                entity.Property(e => e.PublicKey).IsRequired();
            });

            modelBuilder.Entity<MessageModel>(entity =>
            {
                entity.HasKey(e => e.MessageId);
                entity.HasIndex(e => new { e.RoomId, e.CreatedAt });
                entity.HasOne(e => e.To).WithMany(r => r.Messages).HasForeignKey(e => e.RoomId);
                entity.HasOne(e => e.User).WithMany().HasForeignKey(e => e.From);
                entity.Property(e => e.CipherText).IsRequired();
                entity.Property(e => e.Nonce).IsRequired();
                entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            });

            modelBuilder.Entity<RoomModel>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).IsRequired();
                entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            });

            modelBuilder.Entity<RoomMemberModel>(entity =>
            {
                entity.HasKey(e => new { e.RoomId, e.UserId });
                entity.HasOne(e => e.Room).WithMany(e => e.Users).HasForeignKey(e => e.UserId);
            });

            modelBuilder.Entity<EncryptionKeyModel>(entity => 
            {
                entity.HasKey(e => new { e.RoomId, e.UserId, e.KeyVersion });
                entity.HasOne(e => e.Room).WithMany(e => e.Keys).HasForeignKey(e => e.RoomId);
                entity.HasOne(e => e.User).WithMany().HasForeignKey(e => e.UserId);
                entity.Property(e => e.Key).IsRequired();
                entity.Property(e => e.CreatedAt).HasDefaultValueSql("CURRENT_TIMESTAMP");
            });
        }
    }
}
