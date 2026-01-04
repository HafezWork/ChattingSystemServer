# Project Setup

## Initial Steps to Start the Server

1. **Start MySQL Docker Container**  
    Run the following command to start a MySQL container:

    ```bash
    docker run --name mysql-container -e MYSQL_ROOT_PASSWORD=YourPassword -e MYSQL_DATABASE=ChatDb -p 3306:3306 -d mysql:latest
    ```

    This command will:
    - Create a MySQL container named `mysql-container`.
    - Set the root password to `root`.
    - Create a database named `mydb`.
    - Expose MySQL on port `3306`.

2. **Check and Apply Migrations**  
    If no migrations are found in the database, you need to create and apply them. Use the following commands:

    ```bash
    dotnet ef migrations add InitialCreate
    dotnet ef database update
    ```

    - The first command creates a migration named `InitialCreate`.
    - The second command applies the migration to set up the database schema.

    Ensure that your `appsettings.json` or configuration file is correctly set up to connect to the MySQL database.

3. **Start the Server**  
    After the migrations are complete, you can safely start the server:

    ```bash
    dotnet run
    ```

Your server should now be up and running!